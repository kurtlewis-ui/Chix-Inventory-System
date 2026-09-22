import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new branch (Owner/Admin only).
   */
  async create(dto: CreateBranchDto, createdBy: string) {
    const name = dto.name.trim();

    const existing = await this.prisma.branch.findFirst({
      where: { name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('A branch with that name already exists');
    }

    const branch = await this.prisma.branch.create({
      data: {
        name,
        address: dto.address?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: createdBy,
        action: 'BRANCH_CREATED',
        entityType: 'Branch',
        entityId: branch.id,
        newValues: {
          name: branch.name,
          address: branch.address,
        },
      },
    });

    return this.serialize(branch);
  }

  /**
   * List branches.
   *
   * Owner/Admin sees every (non-deleted) branch.
   * Staff sees only the branch they are assigned to (if any).
   */
  async findAll(viewer: { userId: string; role: string }) {
    if (viewer.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: viewer.userId },
        select: { branchId: true },
      });

      if (!me?.branchId) {
        return [];
      }

      const branch = await this.prisma.branch.findFirst({
        where: { id: me.branchId, deletedAt: null },
        include: { _count: { select: { users: true } } },
      });

      return branch ? [this.serialize(branch)] : [];
    }

    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { users: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return branches.map((b) => this.serialize(b));
  }

  /**
   * List archived (soft-deleted) branches for the Archive page.
   */
  async findArchived() {
    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: { not: null } },
      include: { _count: { select: { users: true } } },
      orderBy: { deletedAt: 'desc' },
    });
    return branches.map((b) => this.serialize(b));
  }

  /**
   * Restore a soft-deleted branch.
   */
  async restore(id: string, restoredBy: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: { not: null } },
    });
    if (!branch) {
      throw new NotFoundException('Archived branch not found');
    }

    const conflict = await this.prisma.branch.findFirst({
      where: { name: branch.name, deletedAt: null },
    });
    if (conflict) {
      throw new ConflictException(
        'An active branch with that name already exists. Rename it before restoring.',
      );
    }

    const restored = await this.prisma.branch.update({
      where: { id },
      data: { deletedAt: null, isActive: true },
      include: { _count: { select: { users: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: restoredBy,
        action: 'BRANCH_RESTORED',
        entityType: 'Branch',
        entityId: id,
        newValues: { name: branch.name },
      },
    });

    return this.serialize(restored);
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { users: true } } },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return this.serialize(branch);
  }

  async update(id: string, dto: UpdateBranchDto, updatedBy: string) {
    const current = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException('Branch not found');
    }

    const data: { name?: string; address?: string | null; isActive?: boolean } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== current.name) {
        const conflict = await this.prisma.branch.findFirst({
          where: { name, deletedAt: null, NOT: { id } },
        });
        if (conflict) {
          throw new ConflictException('A branch with that name already exists');
        }
        data.name = name;
      }
    }
    if (dto.address !== undefined) {
      data.address = dto.address?.trim() || null;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    const updated = await this.prisma.branch.update({
      where: { id },
      data,
    });

    await this.prisma.auditLog.create({
      data: {
        userId: updatedBy,
        action: 'BRANCH_UPDATED',
        entityType: 'Branch',
        entityId: id,
        oldValues: {
          name: current.name,
          address: current.address,
          isActive: current.isActive,
        },
        newValues: data,
      },
    });

    return this.serialize(updated);
  }

  /**
   * Soft-delete a branch. Refuses if any (non-deleted) user is still
   * assigned to it — caller must reassign staff first.
   */
  async remove(id: string, deletedBy: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const assignedUsers = await this.prisma.user.count({
      where: { branchId: id, deletedAt: null },
    });

    if (assignedUsers > 0) {
      throw new BadRequestException(
        `Cannot delete this branch — ${assignedUsers} staff member(s) are still assigned to it. Reassign them first.`,
      );
    }

    await this.prisma.branch.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: deletedBy,
        action: 'BRANCH_DELETED',
        entityType: 'Branch',
        entityId: id,
        oldValues: {
          name: branch.name,
          address: branch.address,
        },
      },
    });

    return { message: 'Branch deleted successfully' };
  }

  private serialize(branch: {
    id: string;
    name: string;
    address: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count?: { users: number };
  }) {
    return {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      isActive: branch.isActive,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
      staffCount: branch._count?.users ?? 0,
    };
  }
}
