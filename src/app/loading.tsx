export default function Loading() {
  return (
    <main className="page loadingPage">
      <div className="container card skeletonCard">
        <div className="skeletonTitle" />
        <div className="skeletonSubtitle" />
        <div className="skeletonTable" />
      </div>
    </main>
  );
}
