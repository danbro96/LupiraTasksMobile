// Param lists for typed navigation. Add new screens here as the app grows.

export type RootStackParamList = {
  Login: undefined;
  Lists: undefined;
  ListDetail: { listId: string; name: string };
  ListSettings: { listId: string; name: string };
  TaskDetail: { listId: string; itemId: string };
  Account: undefined;
  SyncIssues: undefined;
  CreateList: undefined;
  ArchivedLists: undefined;
};
