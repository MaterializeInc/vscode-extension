import AdminClient from "./admin";
import { Errors, ExtensionError } from "../utilities/error";
import { fetchWithRetry } from "../utilities/utils";

const DEFAULT_API_CLOUD_ENDPOINT = 'https://api.cloud.materialize.com';

interface RegionInfo {
    /// Represents the environmentd PG wire protocol address.
    ///
    /// E.g.: 3es24sg5rghjku7josdcs5jd7.eu-west-1.aws.materialize.cloud:6875
    sqlAddress: string,
    /// Represents the environmentd HTTP address.
    ///
    /// E.g.: 3es24sg5rghjku7josdcs5jd7.eu-west-1.aws.materialize.cloud:443
    httpAddress: string,
    /// Indicates true if the address is resolvable by DNS.
    resolvable: boolean,
    /// The time at which the region was enabled
    enabledAt: Date,
}

/// Connection details for an active region
interface Region {
    regionInfo: RegionInfo | undefined;
}

interface CloudProvider {
    /// Contains the concatenation between cloud provider name and region:
    ///
    /// E.g.: `aws/us-east-1` or `aws/eu-west-1`
    id: string,
    /// Contains the region name:
    ///
    /// E.g.: `us-east-1` or `eu-west-1`
    name: string,
    /// Contains the complete region controller url.
    ///
    /// E..g: `https://api.eu-west-1.aws.cloud.materialize.com`
    url: string,
    /// Contains the cloud provider name.
    ///
    /// E.g.: `aws` or `gcp`
    cloudProvider: string,
}

interface CloudProviderResponse {
    data: Array<CloudProvider>,
    nextCursor?: string,
}

export default class CloudClient {
    adminClient: AdminClient;
    providersEndpoint: string;

    constructor(adminClient: AdminClient, endpoint?: string) {
        this.adminClient = adminClient;
        this.providersEndpoint = `${endpoint || DEFAULT_API_CLOUD_ENDPOINT}/api/cloud-regions`;
    }

    async fetch(endpoint: string) {
        return fetchWithRetry(endpoint, {
            method: 'get',
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "Authorization": `Bearer ${await this.adminClient.getToken()}`
            }
        });
    }

    async listCloudProviders() {
        const cloudProviders = [];
        let cursor = '';

        try {
            let retry = true;
            while (retry) {
                const response = await this.fetch(`${this.providersEndpoint}?limit=50&cursor=${cursor}`);

                console.log("[CloudClient]", `Status: ${response.status}`);
                const cloudProviderResponse = (await response.json()) as CloudProviderResponse;
                cloudProviders.push(...cloudProviderResponse.data);

                if (cloudProviderResponse.nextCursor) {
                    cursor = cloudProviderResponse.nextCursor;
                } else {
                    retry = false;
                }
            }
        } catch (err) {
            console.error("[CloudClient]", "Error listing cloud providers: ", err);
            throw new ExtensionError(Errors.listingCloudProviders, err);
        }

        return cloudProviders;
    }

    async getRegion(cloudProvider: CloudProvider): Promise<Region> {
        try {
            const regionEdnpoint = `${cloudProvider.url}/api/region`;

            const response = await this.fetch(regionEdnpoint);

            console.log("[CloudClient]", `Status: ${response.status}`);
            if (response.status === 200) {
                const region: Region = (await response.json()) as Region;
                return region;
            } else {
                throw new Error((await response.json() as any).error);
            }
        } catch (err) {
            console.error("[CloudClient]", "Error retrieving region: ", err);
            throw new Error(Errors.retrievingRegion);
        }
    }

    /**
     * Returns an environment's hostname
     * @param regionId Possible values: "aws/us-east-1", "aws/eu-west-1"
     * @returns
     */
    async getHost(region: string) {
        console.log("[CloudClient]", "Listing cloud providers.");
        const cloudProviders = await this.listCloudProviders();

        console.log("[CloudClient]", "Providers: ", cloudProviders);
        const provider = cloudProviders.find(x => x.id === region);

        console.log("[CloudClient]", "Selected provider: ", provider);
        if (provider) {
            console.log("[CloudClient]", "Retrieving region.");
            const { regionInfo } = await this.getRegion(provider);
            console.log("[CloudClient]", "Region: ", regionInfo);

            if (!regionInfo) {
                console.error("[CloudClient]", "Region is not enabled.");
                throw new Error(Errors.disabledRegion);
            } else {
                return regionInfo.sqlAddress;
            }
        } else {
            throw new Error(Errors.invalidProvider.replace("${region}", region));
        }
    }
}