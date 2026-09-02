export type ProductDetailFromId =
  | 'weekly-report'
  | 'dashboard'
  | 'products'
  | 'quality'

export const PRODUCT_DETAIL_FROM_LABELS: Record<ProductDetailFromId, string> = {
  'weekly-report': '주간업무 보고',
  dashboard: '대시보드',
  products: '품번 분석',
  quality: '품질 분석',
}

export const PRODUCT_DETAIL_FROM_PATHS: Record<ProductDetailFromId, string> = {
  'weekly-report': '/weekly-report',
  dashboard: '/',
  products: '/products',
  quality: '/quality',
}

export function parseProductDetailFrom(
  value: string | null,
): ProductDetailFromId {
  if (
    value === 'weekly-report' ||
    value === 'dashboard' ||
    value === 'products' ||
    value === 'quality'
  ) {
    return value
  }
  return 'products'
}

export function buildProductDetailHref(
  productId: string,
  from: ProductDetailFromId,
  options?: { startDate?: string; endDate?: string },
): string {
  const params = new URLSearchParams({ from })
  if (options?.startDate) params.set('startDate', options.startDate)
  if (options?.endDate) params.set('endDate', options.endDate)
  return `/products/${productId}?${params.toString()}`
}
