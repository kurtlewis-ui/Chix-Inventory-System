/**
 * One-time migration: move existing base64 (data:) images out of the database
 * and into Cloudinary, replacing each with its hosted URL. Frees Postgres/Neon
 * storage. Safe to run more than once — rows that already hold an http(s) URL
 * are skipped.
 *
 * Requires the same Cloudinary env vars the app uses:
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 * and DATABASE_URL.
 *
 * Run:  npm run migrate:images-to-cloudinary
 *
 * It processes:
 *   - products.image      (folder: products)
 *   - brands.cover_image  (folder: brands)
 *   - users.avatar_url    (folder: avatars)
 */
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';

const prisma = new PrismaClient();

function assertConfigured() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.error(
      '\n❌ Cloudinary env vars missing. Set CLOUDINARY_CLOUD_NAME, ' +
        'CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET before running.\n',
    );
    process.exit(1);
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function isDataUrl(v: string | null): v is string {
  return !!v && v.startsWith('data:');
}

async function uploadOne(dataUrl: string, folder: string): Promise<string> {
  const res = await cloudinary.uploader.upload(dataUrl, {
    folder,
    resource_type: 'image',
    overwrite: false,
  });
  return res.secure_url;
}

async function migrateProducts() {
  const rows = await prisma.product.findMany({ select: { id: true, name: true, image: true } });
  let migrated = 0;
  for (const r of rows) {
    if (!isDataUrl(r.image)) continue;
    try {
      const url = await uploadOne(r.image, 'products');
      await prisma.product.update({ where: { id: r.id }, data: { image: url } });
      migrated++;
      console.log(`  ✓ product "${r.name}"`);
    } catch (e) {
      console.error(`  ✗ product "${r.name}" — ${(e as Error).message}`);
    }
  }
  return migrated;
}

async function migrateBrands() {
  const rows = await prisma.brand.findMany({ select: { id: true, name: true, coverImage: true } });
  let migrated = 0;
  for (const r of rows) {
    if (!isDataUrl(r.coverImage)) continue;
    try {
      const url = await uploadOne(r.coverImage, 'brands');
      await prisma.brand.update({ where: { id: r.id }, data: { coverImage: url } });
      migrated++;
      console.log(`  ✓ brand "${r.name}"`);
    } catch (e) {
      console.error(`  ✗ brand "${r.name}" — ${(e as Error).message}`);
    }
  }
  return migrated;
}

async function migrateUsers() {
  const rows = await prisma.user.findMany({ select: { id: true, email: true, avatarUrl: true } });
  let migrated = 0;
  for (const r of rows) {
    if (!isDataUrl(r.avatarUrl)) continue;
    try {
      const url = await uploadOne(r.avatarUrl, 'avatars');
      await prisma.user.update({ where: { id: r.id }, data: { avatarUrl: url } });
      migrated++;
      console.log(`  ✓ user "${r.email}"`);
    } catch (e) {
      console.error(`  ✗ user "${r.email}" — ${(e as Error).message}`);
    }
  }
  return migrated;
}

async function main() {
  console.log('🖼️  Migrating base64 images → Cloudinary...\n');
  assertConfigured();

  console.log('Products:');
  const p = await migrateProducts();
  console.log('Brands:');
  const b = await migrateBrands();
  console.log('Users:');
  const u = await migrateUsers();

  console.log(
    `\n✅ Done. Migrated ${p} product image(s), ${b} brand cover(s), ${u} avatar(s).`,
  );
  console.log('Rows that already held a URL (or had no image) were skipped.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
