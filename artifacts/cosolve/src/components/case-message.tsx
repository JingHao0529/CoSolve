const demoImageMarker = /\n\nIllustrative image: (\/demo-assets\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp))\s*$/i;

export function CaseMessage({ message }: { message: string }) {
  const match = message.match(demoImageMarker);
  const text = match ? message.slice(0, match.index).trimEnd() : message;
  const imagePath = match?.[1];
  const assetBase = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  return (
    <>
      <p className="whitespace-pre-wrap">{text}</p>
      {imagePath && (
        <figure className="mt-4 max-w-xl">
          <img
            src={`${assetBase}${imagePath.slice(1)}`}
            alt="Illustrative image of a fictional incorrect takeaway order"
            loading="lazy"
            className="w-full rounded-md border border-line object-cover"
          />
          <figcaption className="mt-2 text-xs text-ink-faint">
            AI-generated illustration · not customer-supplied evidence
          </figcaption>
        </figure>
      )}
    </>
  );
}
