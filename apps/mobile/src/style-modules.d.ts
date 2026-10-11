// Expo Web resolves CSS imports at bundling time. These declarations make
// module classes and global style side-effect imports visible to TypeScript.
declare module '*.module.css' {
  const classNames: Record<string, string>;
  export default classNames;
}

declare module '*.css';
