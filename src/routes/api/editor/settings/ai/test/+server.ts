import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditor } from '$lib/server/guard';
import { aiTestSchema } from '$lib/server/schemas';
import { resolveConfigForTest, testConnection } from '$lib/server/ai-settings';

/**
 * Probe a provider config (inline, or by id to reuse a stored key when the key field
 * is blank). Returns 200 with `result.ok` reflecting whether the endpoint answered.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const body = await request.json().catch(() => null);
	const parsed = aiTestSchema.safeParse(body);
	if (!parsed.success) {
		return json({ ok: false, error: '参数无效', errorEn: 'Invalid input' }, { status: 400 });
	}
	const { id, ...inline } = parsed.data;
	const result = await testConnection(resolveConfigForTest(inline, id));
	return json({ ok: true, result });
};
