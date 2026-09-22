import { ApiProperty, PartialType, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

// Drop password (handled by a dedicated reset endpoint), and drop branchId
// and phone so we can re-declare them as nullable below.
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'branchId', 'phone'] as const),
) {
  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  roleId?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  mustChangePassword?: boolean;

  // Allow explicitly clearing the branch by passing null.
  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Branch UUID, or null to unassign',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  branchId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  phone?: string | null;
}
