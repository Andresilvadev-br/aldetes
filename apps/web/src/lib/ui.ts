import { create } from 'zustand';

/** App-wide UI: lets any component open the user settings at a given tab, or the Ctrl+K command bar. */
export const useUi = create<{ settingsTab: string | null; switcher: boolean }>()(() => ({ settingsTab: null, switcher: false }));
export const openSettings = (tab = 'account') => useUi.setState({ settingsTab: tab });
export const closeSettings = () => useUi.setState({ settingsTab: null });
export const openSwitcher = (open = true) => useUi.setState({ switcher: open });
