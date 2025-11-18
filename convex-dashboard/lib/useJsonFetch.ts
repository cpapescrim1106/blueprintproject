import useSWR, { type SWRConfiguration } from "swr";

export const jsonFetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
};

export function useJsonData<T>(
  key: string | null,
  config?: SWRConfiguration<T>,
) {
  return useSWR<T>(key, jsonFetcher, config);
}
