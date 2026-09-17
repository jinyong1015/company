export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminAuthError'
  }
}
