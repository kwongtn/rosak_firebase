export interface PublicSocialMediaLinkLine {
  id: string;
  code: string;
  displayName: string;
}
export interface PublicSocialMediaLinkVehicle {
  id: string;
  identificationNo: string;
}
export interface PublicSocialMediaLinkStation {
  id: string;
  displayName: string;
}
export interface PublicSocialMediaLink {
  id: string;
  url: string;
  title: string;
  created: string;
  completed: boolean;
  lines: PublicSocialMediaLinkLine[];
  vehicles: PublicSocialMediaLinkVehicle[];
  stations: PublicSocialMediaLinkStation[];
}
export interface PublicSocialMediaLinksQueryData {
  publicSocialMediaLinks: PublicSocialMediaLink[];
}
export const PUBLIC_SOCIAL_MEDIA_LINKS_QUERY = `
  query PublicSocialMediaLinks($lineId: ID) {
    publicSocialMediaLinks(lineId: $lineId) {
      id
      url
      title
      created
      completed
      lines { id code displayName }
      vehicles { id identificationNo }
      stations { id displayName }
    }
  }
`;
