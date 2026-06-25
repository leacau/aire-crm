export type {
  Client,
  CondicionIVA,
  CreateClientInput,
  CreatePersonInput,
  Person,
  TipoEntidad,
  UpdateClientInput,
  UpdatePersonInput,
} from './domain/client';
export {
  createClient,
  createPerson,
  deletePerson,
  getClient,
  getClients,
  getPeopleByClientId,
  updateClient,
  updatePerson,
} from './infrastructure/http/client-api-client';
