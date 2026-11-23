import { Link, Route, Routes, useParams } from "react-router-dom";
import { useData, type Actor } from "../api";
import { QaAnalytics, QaDashboard } from "../components/qa/QaDashboard";
import { QaPolicies } from "../components/qa/QaPolicies";
import { QaReviewWorkspace } from "../components/qa/QaReviewWorkspace";
import { isAdmin } from "../components/qa/qa-api";
import "../components/qa/qa.css";

function ReviewRoute({ actor }: { actor: Actor }) {
  const { id } = useParams();
  return id ? <QaReviewWorkspace key={id} actor={actor} id={id} /> : <p role="alert">Review is unavailable.</p>;
}
export function QA() {
  const { data: actor } = useData<Actor>("/session");
  if (!actor) return <p role="status">Checking QA access…</p>;
  return <div className="qa-shell">
    <nav aria-label="Quality assurance views" className="qa-tabs">
      <Link to="/qa">Overview and worklist</Link><Link to="/qa/analytics">Quality analytics</Link>
      {isAdmin(actor) && <Link to="/qa/policies">Sampling policies</Link>}
    </nav>
    <Routes>
      <Route index element={<QaDashboard actor={actor} />} />
      <Route path="analytics" element={<QaAnalytics actor={actor} />} />
      <Route path="reviews/:id" element={<ReviewRoute actor={actor} />} />
      <Route path="policies" element={isAdmin(actor) ? <QaPolicies actor={actor} /> : <p role="alert">Sampling policy access is restricted.</p>} />
      <Route path="*" element={<p role="alert">QA page unavailable.</p>} />
    </Routes>
  </div>;
}
