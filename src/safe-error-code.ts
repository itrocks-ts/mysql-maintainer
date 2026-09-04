
const SAFE_DRIVER_ERROR_CODES = new Set([
	'ER_BAD_FIELD_ERROR',
	'ER_CANNOT_ADD_FOREIGN',
	'ER_DUP_ENTRY',
	'ER_NO_SUCH_TABLE'
])

export function safeDriverErrorCode(error: unknown): string
{
	const code = (typeof error === 'object') && error && ('code' in error)
		? (error as { code?: unknown }).code
		: undefined
	return (typeof code === 'string') && SAFE_DRIVER_ERROR_CODES.has(code) ? code : 'UNKNOWN'
}
