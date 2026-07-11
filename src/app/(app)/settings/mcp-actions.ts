'use server';

import { requireUser } from '@/lib/auth';
import { issueMcpToken, revokeMcpToken } from '@/data/mcp-tokens';
import { revalidatePath } from 'next/cache';

// Mint (or replace) the caller's MCP token and return the plaintext ONCE. Gated on
// requireUser — a write, so it's owner-only and blocked while viewing as someone.
export async function issueMcpTokenAction(canWrite = false): Promise<{ token: string }> {
  await requireUser();
  const token = await issueMcpToken(canWrite);
  revalidatePath('/settings');
  return { token };
}

export async function revokeMcpTokenAction(): Promise<void> {
  await requireUser();
  await revokeMcpToken();
  revalidatePath('/settings');
}
