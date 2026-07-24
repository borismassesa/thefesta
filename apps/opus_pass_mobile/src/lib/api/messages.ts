import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversationSummary, MessageRow, MessageThreadRow } from '@/types/messages';

/**
 * `message_threads` stores no preview or unread columns (022_messaging_system.sql)
 * — of_mobile's ConversationThread type claims `last_message`/`unread_count`,
 * which silently read as undefined. Both are derived here from `messages`
 * instead, in one extra query rather than one per thread.
 */
export async function getConversations(
  client: SupabaseClient,
  currentUserId: string | null,
): Promise<ConversationSummary[]> {
  const { data: threads, error } = await client
    .from('message_threads')
    .select('*, vendors:vendor_id (id, business_name, logo)')
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw error;

  const rows = (threads ?? []) as unknown as MessageThreadRow[];
  if (rows.length === 0) return [];

  const { data: messages, error: messagesError } = await client
    .from('messages')
    .select('thread_id, content, created_at, read_at, sender_id')
    .in(
      'thread_id',
      rows.map((thread) => thread.id),
    )
    .order('created_at', { ascending: false });

  if (messagesError) throw messagesError;

  const previews = new Map<string, string>();
  const unread = new Map<string, number>();

  for (const message of (messages ?? []) as Pick<
    MessageRow,
    'thread_id' | 'content' | 'created_at' | 'read_at' | 'sender_id'
  >[]) {
    if (!previews.has(message.thread_id)) previews.set(message.thread_id, message.content);
    if (!message.read_at && message.sender_id !== currentUserId) {
      unread.set(message.thread_id, (unread.get(message.thread_id) ?? 0) + 1);
    }
  }

  return rows.map((thread) => ({
    ...thread,
    preview: previews.get(thread.id) ?? null,
    unreadCount: unread.get(thread.id) ?? 0,
  }));
}

export async function getMessages(
  client: SupabaseClient,
  threadId: string,
): Promise<MessageRow[]> {
  const { data, error } = await client
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

/**
 * Finds the couple's existing thread with a vendor, or opens one. Relies on
 * the `message_threads_user_id_vendor_id_key` unique constraint
 * (022_messaging_system.sql) so this is safe to call every time "Message
 * Vendor" is pressed rather than only on first contact.
 */
export async function getOrCreateThread(
  client: SupabaseClient,
  userId: string,
  vendorId: string,
): Promise<MessageThreadRow> {
  const { data: existing, error: findError } = await client
    .from('message_threads')
    .select('*, vendors:vendor_id (id, business_name, logo)')
    .eq('user_id', userId)
    .eq('vendor_id', vendorId)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing as unknown as MessageThreadRow;

  const { data: created, error: createError } = await client
    .from('message_threads')
    .insert({ user_id: userId, vendor_id: vendorId })
    .select('*, vendors:vendor_id (id, business_name, logo)')
    .single();

  if (createError) throw createError;
  return created as unknown as MessageThreadRow;
}

export async function getThread(
  client: SupabaseClient,
  threadId: string,
): Promise<MessageThreadRow | null> {
  const { data, error } = await client
    .from('message_threads')
    .select('*, vendors:vendor_id (id, business_name, logo)')
    .eq('id', threadId)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as MessageThreadRow) ?? null;
}

export async function sendMessage(
  client: SupabaseClient,
  threadId: string,
  senderId: string,
  content: string,
): Promise<MessageRow> {
  const { data, error } = await client
    .from('messages')
    .insert({ thread_id: threadId, sender_id: senderId, content })
    .select()
    .single();

  if (error) throw error;

  // Fire-and-forget push to the other participant — never blocks the send.
  client.functions
    .invoke('send-push', { body: { event: 'message', messageId: data.id } })
    .catch(() => {});

  return data as MessageRow;
}

export async function markThreadRead(client: SupabaseClient, threadId: string, currentUserId: string) {
  const { error } = await client
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .neq('sender_id', currentUserId)
    .is('read_at', null);

  if (error) throw error;
}
