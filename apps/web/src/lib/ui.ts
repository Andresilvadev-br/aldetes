import { create } from 'zustand';

/** App-wide UI: lets any component open the user settings at a given tab. */
export const useUi = create<{ settingsTab: string | null }>()(() => ({ settingsTab: null }));
export const openSettings = (tab = 'account') => useUi.setState({ settingsTab: tab });
export const closeSettings = () => useUi.setState({ settingsTab: null });
