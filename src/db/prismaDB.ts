import { PrismaClient } from '@/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prismaDB = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production')
{
  globalForPrisma.prisma = prismaDB
}

export default prismaDB