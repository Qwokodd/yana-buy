import { imageUrl } from "../utils/upload";

// Renders a store/restaurant's logo: a real uploaded photo if one exists,
// otherwise the original emoji-in-a-tinted-circle look everyone already
// had before uploads existed. Every store/restaurant keeps working with
// zero migration -- `logoImage` is just an optional extra field.
export default function StoreLogo({
  image,
  emoji,
  color,
  style,
  sizeClass = "w-10 h-10",
  textSizeClass = "text-lg",
  roundedClass = "rounded-full",
  className = "",
}) {
  if (image) {
    return (
      <img
        src={imageUrl(image)}
        alt=""
        className={`${sizeClass} ${roundedClass} object-cover shrink-0 ${className}`}
      />
    );
  }

  const bgStyle = style || (color ? { background: `${color}1a` } : undefined);
  return (
    <div
      className={`${sizeClass} ${roundedClass} flex items-center justify-center ${textSizeClass} shrink-0 ${className}`}
      style={bgStyle}
    >
      {emoji}
    </div>
  );
}
