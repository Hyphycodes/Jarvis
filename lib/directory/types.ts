export type OwnerProfile = {
  displayName: string;
  homeRegion: string;
  productMode: "private_single_user";
};

export type QualityGate = {
  id: string;
  name: string;
  failureBehavior: "reject" | "downgrade" | "hide" | "route_lower";
};

export type DirectoryPerson = {
  id: string;
  name: string;
  category?: string;
  role?: string;
  notes: string[];
};

export type DirectoryPlace = {
  id: string;
  name: string;
  category?: string;
  neighborhood?: string;
  city?: string;
  notes: string[];
};

export type TasteGraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: "affinity" | "avoidance" | "curiosity" | "stretch";
  weight: number;
};

export type DirectoryContext = {
  ownerProfile: OwnerProfile;
  people: DirectoryPerson[];
  places: DirectoryPlace[];
  tasteGraph: TasteGraphEdge[];
};
