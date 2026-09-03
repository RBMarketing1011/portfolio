import { notFound, redirect } from "next/navigation"

export default async function LegacyProjectRoute ({ params }: { params: Promise<{ id: string }> })
{
  const { id } = await params
  if (!id) notFound()
  redirect(`/work/${id}`)
}
