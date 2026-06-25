import type {
  CreateProspectInput,
  Prospect,
  UpdateProspectInput,
} from '../domain/prospect';

export type ProspectActor = {
  id: string;
  name: string;
};

/**
 * Port shared by the web adapter today and the HTTP API/Android client later.
 * Business use cases depend on this contract, never on Firebase directly.
 */
export interface ProspectRepository {
  list(): Promise<Prospect[]>;
  create(input: CreateProspectInput, actor: ProspectActor): Promise<string>;
  update(id: string, input: UpdateProspectInput, actor: ProspectActor): Promise<void>;
  delete(id: string, actor: ProspectActor): Promise<void>;
  claim(prospect: Prospect, actor: ProspectActor): Promise<void>;
  approveClaim(prospect: Prospect, actor: ProspectActor): Promise<void>;
  rejectClaim(prospect: Prospect, actor: ProspectActor): Promise<void>;
}
