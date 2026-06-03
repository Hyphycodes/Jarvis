import type { DirectoryContext, OwnerProfile } from "@/lib/directory/types";
import { listDirectoryPeople } from "@/lib/directory/people";
import { listDirectoryPlaces } from "@/lib/directory/places";
import { listTasteGraphEdges } from "@/lib/directory/tasteGraph";

export const ownerProfile: OwnerProfile = {
  displayName: "J.",
  homeRegion: "",
  productMode: "private_single_user",
};

export async function loadDirectoryContext(): Promise<DirectoryContext> {
  const [people, places, tasteGraph] = await Promise.all([
    listDirectoryPeople(),
    listDirectoryPlaces(),
    listTasteGraphEdges(),
  ]);

  return {
    ownerProfile,
    people,
    places,
    tasteGraph,
  };
}
