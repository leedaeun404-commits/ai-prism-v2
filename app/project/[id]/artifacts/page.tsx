import Link from "next/link";

export default function ProjectArtifactsPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Artifacts</h1>
      <p style={{ color: "#666", marginBottom: 16 }}>Project ID: {params.id}</p>
      <p style={{ marginBottom: 20 }}>Artifacts 페이지 기본 라우트가 준비되었습니다.</p>
      <Link href={`/project/${params.id}`}>Overview로 돌아가기</Link>
    </main>
  );
}
