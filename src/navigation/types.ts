// Param lists for typed navigation. Add new screens here as the app grows.

export type RootStackParamList = {
  Login: undefined;
  Lists: undefined;
  ListDetail: { listId: string; name: string };
};
