// Contexte partagé entre les panneaux. Les actions sont branchées par main.js.
export const ctx = {
  route: { c: 'all', arg: null, note: null, line: null },
  query: '',
  showDone: false,
  statut: '',
  limit: 200,
  // actions (assignées au démarrage)
  openNote: () => {},
  closeNote: () => {},
  newNote: () => {},
  openToday: () => {},
  openDay: () => {},
  openCollection: () => {},
  newPerson: () => {},
  openReview: () => {},
  openTemplates: () => {},
  openPalette: () => {},
  openSettings: () => {},
  openDrawer: () => {},
  closeDrawer: () => {},
  refreshList: () => {},
};
