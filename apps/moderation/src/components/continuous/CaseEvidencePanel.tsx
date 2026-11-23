import { useRef, useState } from "react";
import { Building2, Check, Compass, Copy, ExternalLink, FileText, ImageOff, MapPin, Maximize2 } from "lucide-react";
import { label, type Attachment, type Reservation } from "./workspaceContract";

function AttachmentImage({ attachment, expanded = false }: { attachment: Attachment; expanded?: boolean }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const allowed = /^\/api\/v1\/moderation\/evidence\/[a-z0-9-]+\/media$/i.test(attachment.path) &&
    ["image/jpeg", "image/png", "image/webp"].includes(attachment.contentType);
  if (!allowed || state === "failed") return <p className="mw-muted"><ImageOff size={16} /> Attachment unavailable.</p>;
  return <>
    {state === "loading" && <p role="status">Loading image…</p>}
    <img className={expanded ? "mw-image-expanded" : "mw-image-preview"}
      src={attachment.path} alt={attachment.description || "Submitted parking evidence"}
      onLoad={() => setState("loaded")} onError={() => setState("failed")} />
  </>;
}

export function EvidenceGallery({ attachments }: { attachments: Attachment[] }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  if (!attachments.length) return <p className="mw-muted">No attachments were supplied.</p>;
  return <>
    <div className="mw-gallery">{attachments.map((attachment, i) => <figure key={attachment.id}>
      <AttachmentImage attachment={attachment} />
      <figcaption><button type="button" onClick={() => {
        setIndex(i);
        setOpen(true);
        dialog.current?.showModal();
      }}>
        <Maximize2 size={14} /> Inspect attachment {i + 1}
      </button></figcaption>
    </figure>)}</div>
    <dialog ref={dialog} className="mw-dialog mw-media-dialog" aria-labelledby="attachment-title"
      onClose={() => setOpen(false)} onKeyDown={(event) => {
        if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
        if (event.key === "ArrowRight") setIndex((current) => Math.min(attachments.length - 1, current + 1));
      }}>
      <h2 id="attachment-title">Evidence attachment {index + 1} of {attachments.length}</h2>
      {open && <AttachmentImage key={attachments[index].id} attachment={attachments[index]} expanded />}
      <div className="mw-actions">
        <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
        <button type="button" disabled={index + 1 === attachments.length} onClick={() => setIndex(index + 1)}>Next attachment</button>
        <button type="button" onClick={() => dialog.current?.close()}>Close image viewer</button>
      </div>
    </dialog>
  </>;
}

export function CaseEvidencePanel({ reservation, serverNow }: { reservation: Reservation; serverNow: number }) {
  const item = reservation.case;
  const facility = item.admission?.facility;
  const report = item.metadata?.report;
  const evidence = facility?.evidence ?? [];

  const [copied, setCopied] = useState(false);

  // Extract place ID from all possible candidate locations
  const googlePlaceId =
    facility?.googlePlaceId ||
    item.metadata?.report?.googlePlaceId ||
    (item.metadata as any)?.googlePlaceId ||
    (facility?.id && facility.id.startsWith("ChIJ") ? facility.id : null);

  const lat = facility?.latitude;
  const lng = facility?.longitude;
  const facilityName = facility?.displayName || "Parking Facility";
  const facilityAddress = facility?.formattedAddress;

  const mapsSearchUrl = googlePlaceId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(facilityName)}&query_place_id=${googlePlaceId}`
    : lat != null && lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : facilityAddress
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(facilityAddress)}`
        : null;

  const mapsDirectUrl = googlePlaceId
    ? `https://www.google.com/maps/place/?q=place_id:${googlePlaceId}`
    : null;

  const streetViewUrl = lat != null && lng != null
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
    : null;

  const handleCopyPlaceId = () => {
    if (googlePlaceId) {
      navigator.clipboard.writeText(googlePlaceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return <div className="mw-case-details">
    <section className="mw-panel" aria-labelledby="facility-heading">
      <div className="mw-panel-heading"><Building2 size={18} /><h2 id="facility-heading">Facility context</h2></div>
      <div className="mw-body">
        <dl className="mw-facts">
          <div><dt>Facility name</dt><dd>{facility?.displayName || "Not provided"}</dd></div>
          <div><dt>Address</dt><dd>{facility?.formattedAddress || "Not provided"}</dd></div>
          <div><dt>Source</dt><dd>{label(item.trigger) || "Unavailable"}</dd></div>
          <div><dt>Priority</dt><dd>{item.priority}</dd></div>
          {googlePlaceId && (
            <div className="mw-fact-full">
              <dt>Google Place ID</dt>
              <dd className="mw-place-id-row">
                <code>{googlePlaceId}</code>
                <button
                  type="button"
                  className="mw-copy-btn"
                  onClick={handleCopyPlaceId}
                  title="Copy Place ID"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </dd>
            </div>
          )}
          {lat != null && lng != null && (
            <div>
              <dt>Coordinates</dt>
              <dd>{lat.toFixed(6)}, {lng.toFixed(6)}</dd>
            </div>
          )}
        </dl>

        {/* Actionable Map Review Links for Moderators */}
        <div className="mw-maps-actions" aria-label="Location Verification Links">
          {mapsSearchUrl && (
            <a
              href={mapsSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mw-map-link mw-primary-map-link"
              title="Open parking location on Google Maps in a new tab"
            >
              <MapPin size={15} />
              <span>Open in Google Maps</span>
              <ExternalLink size={13} />
            </a>
          )}
          {mapsDirectUrl && mapsDirectUrl !== mapsSearchUrl && (
            <a
              href={mapsDirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mw-map-link"
              title="Direct Google Place link"
            >
              <Compass size={15} />
              <span>Direct Place View</span>
              <ExternalLink size={13} />
            </a>
          )}
          {streetViewUrl && (
            <a
              href={streetViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mw-map-link"
              title="Open Google Street View / 360 panorama"
            >
              <Maximize2 size={14} />
              <span>Street View</span>
              <ExternalLink size={13} />
            </a>
          )}
        </div>

        <p className="mw-muted">Use the Google Maps link above to inspect real-world satellite imagery, street view, and business status.</p>
      </div>
    </section>
    <section className="mw-panel" aria-labelledby="evidence-heading">
      <div className="mw-panel-heading"><FileText size={18} /><h2 id="evidence-heading">Case evidence</h2></div>
      <div className="mw-body mw-evidence">
        <div>
          <h3>Reporter claims</h3>
          {report ? <>
            {typeof report.category === "string" && <span className="mw-pill">{label(report.category)}</span>}
            <p className="mw-report">{typeof report.notes === "string" && report.notes.trim() ? report.notes : "No report notes were provided."}</p>
            <small className="mw-muted">Source: User report</small>
          </> : <p className="mw-muted">No user report was supplied.</p>}
        </div>
        <div>
          <h3>Independent evidence</h3>
          {evidence.length ? <ul className="mw-records">{evidence.map((entry) => {
            const current = entry.approvedAt && Date.parse(entry.approvedAt) <= serverNow &&
              Date.parse(entry.expiresAt) > serverNow;
            return <li key={entry.id}>
              <strong>{label(entry.finding)}</strong>
              <span className="mw-muted">{label(entry.source)} · {current ? "Current" : "Unavailable for citation"}</span>
              <span className="mw-reference">{entry.reference}</span>
            </li>;
          })}</ul> : <p className="mw-muted">No independent evidence references on record.</p>}
        </div>
        <div><h3>Attachments</h3><EvidenceGallery attachments={item.attachments ?? []} /></div>
      </div>
    </section>
    <section className="mw-panel" aria-labelledby="history-heading">
      <div className="mw-panel-heading"><h2 id="history-heading">Verification history</h2></div>
      <div className="mw-body">
        {facility?.labels?.length ? <ul className="mw-records">{facility.labels.map((record) =>
          <li key={record.reviewedAt + record.decision}><strong>{label(record.decision)}</strong>
            <time dateTime={record.reviewedAt}>{new Date(record.reviewedAt).toLocaleDateString()}</time>
            {record.expiresAt && Date.parse(record.expiresAt) <= serverNow && <span className="mw-muted">Expired</span>}
          </li>)}</ul> : <p className="mw-muted">No independent verification history on record.</p>}
      </div>
    </section>
  </div>;
}
