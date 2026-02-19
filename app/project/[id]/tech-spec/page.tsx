import Link from "next/link";

export default function ProjectTechSpecPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>STEP 4. 기술 스펙</h1>
      <p style={{ color: "#666", marginBottom: 16 }}>Project ID: {params.id}</p>
      <p style={{ marginBottom: 20 }}>API, 스키마, 상태 전이 규칙, 에러 코드, 모니터링 항목을 구현 수준으로 확정합니다.</p>
      <Link href={`/project/${params.id}`}>Overview로 돌아가기</Link>
    </main>
  );
}
