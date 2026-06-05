// Empty shim so `import "server-only"` resolves when running scripts under tsx
// (Next provides this module via its bundler; it does not exist for plain Node).
// Applied only via tsconfig.scripts.json — never in the app build.
export {};
