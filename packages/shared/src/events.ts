/** Socket.IO event names shared by client and server. */
export const ServerEvents = {
  READY: 'ready',
  MESSAGE_CREATE: 'message:create',
  MESSAGE_UPDATE: 'message:update',
  MESSAGE_DELETE: 'message:delete',
  REACTION_UPDATE: 'reaction:update',
  TYPING_START: 'typing:start',
  PRESENCE_UPDATE: 'presence:update',
  CHANNEL_CREATE: 'channel:create',
  CHANNEL_UPDATE: 'channel:update',
  CHANNEL_DELETE: 'channel:delete',
  CHANNELS_REORDER: 'channels:reorder',
  SERVER_UPDATE: 'server:update',
  SERVER_DELETE: 'server:delete',
  SERVER_JOIN: 'server:join', // you joined a server
  SERVER_LEAVE: 'server:leave', // you left / were kicked / banned
  MEMBER_ADD: 'member:add',
  MEMBER_UPDATE: 'member:update',
  MEMBER_REMOVE: 'member:remove',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  USER_UPDATE: 'user:update',
  RELATIONSHIP_UPDATE: 'relationship:update',
  DM_CREATE: 'dm:create',
  VOICE_STATE_UPDATE: 'voice:state',
  PIN_UPDATE: 'pin:update',
  SESSION_REVOKED: 'session:revoked',
} as const;

export const ClientEvents = {
  TYPING: 'typing',
  PRESENCE_SET: 'presence:set',
  SUBSCRIBE_SERVER: 'subscribe:server',
  ACK: 'ack', // mark channel read
} as const;
