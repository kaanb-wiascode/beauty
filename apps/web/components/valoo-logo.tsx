import { cx } from "@/lib/format";

type ValooLogoProps = {
  className?: string;
  alt?: string;
  priority?: boolean;
};

export function ValooLogo({ className, alt = "VALOO", priority = false }: ValooLogoProps) {
  return (
    <img
      src="/brand/valoo-logo.svg"
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cx("block h-auto object-contain", className)}
    />
  );
}
