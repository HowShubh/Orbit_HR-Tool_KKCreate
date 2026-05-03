export class ActionError extends Error {
  constructor(message: string, public code: string = 'error') {
    super(message)
  }
}
