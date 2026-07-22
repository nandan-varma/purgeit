export type ScanResult =
  | { readonly kind: 'empty' }
  | { readonly kind: 'delete'; readonly deleted: number; readonly failed: number };
