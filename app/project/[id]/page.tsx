import { redirect } from "next/navigation";

export default function ProjectRootPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/project/${params.id}/screening`);
}
