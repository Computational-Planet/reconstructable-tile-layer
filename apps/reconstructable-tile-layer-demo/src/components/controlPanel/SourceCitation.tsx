type CitationInfoProps = {
  citation: string | undefined;
  isOpen: boolean;
  onToggle: () => void;
  panelId: string;
};

export function CitationInfo({ citation, isOpen, onToggle, panelId }: CitationInfoProps) {
  if (!citation) {
    return null;
  }

  return (
    <span className="citation-info-wrap">
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label="Toggle citation guidance"
        className={`citation-info${isOpen ? " is-open" : ""}`}
        onClick={onToggle}
        type="button"
      >
        !
      </button>
      {isOpen ? (
        <span className="citation-popover" id={panelId} role="note">
          {citation}
        </span>
      ) : null}
    </span>
  );
}
