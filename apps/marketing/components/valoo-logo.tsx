type ValooLogoProps = {
  className?: string;
  priority?: boolean;
};

export function ValooLogo({ className, priority = false }: ValooLogoProps) {
  return (
    <img
      src="/brand/valoo-logo.svg"
      alt="VALOO"
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={className}
    />
  );
}
