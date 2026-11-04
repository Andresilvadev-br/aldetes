import { api, setSessionToken } from './api';
import { leaveVoice } from './voice';
import { disconnectGateway } from './gateway';
import { set as setStore, initialState } from '../store';
import { confirmDialog } from '../components/common/overlay';

/** Real logout: leaves the call, invalidates the session on the server, forgets the token. */
export async function logout(ask = true) {
  if (ask && !(await confirmDialog({ title: 'Sair', body: 'Tem certeza de que deseja sair?', confirm: 'Sair', danger: true }))) return false;
  await leaveVoice();
  await api('POST', '/auth/logout').catch(() => {});
  await setSessionToken(null);
  disconnectGateway();
  setStore({ ...initialState, status: 'unauthenticated' });
  return true;
}
