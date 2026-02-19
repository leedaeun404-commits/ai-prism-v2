import Link from "next/link";

export default function ProjectExecutionPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>STEP 3. 자동화·리스크·운영 정책</h1>
      <p style={{ color: "#666", marginBottom: 16 }}>Project ID: {params.id}</p>
      <p style={{ marginBottom: 20 }}>자동화 범위, confidence 정책, fallback/모니터링/롤백 기준을 정하는 단계입니다.</p>
      <Link href={`/project/${params.id}`}>Overview로 돌아가기</Link>
    </main>
  );
}
