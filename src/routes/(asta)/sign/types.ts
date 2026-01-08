export type SignatureType = {
  id: string;
  imageBase64: string;
  page: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  location: string;
  reason: string;
  tampilan: "VISIBLE" | "INVISIBLE";
};

export type PagesInfoType = {
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
};
