import fetch from "node-fetch";
import AdminClient from "./admin";

const SYNC_CLOUD_ENDPOINT = 'https://sync.cloud.materialize.com';
const PROVIDERS_ENDPOINT = `${SYNC_CLOUD_ENDPOINT}/api/cloud-regions`;

/// An environment is represented in this interface
interface Environment {
    /// Represents the environmentd PG wire protocol address.
    ///
    /// E.g.: 3es24sg5rghjku7josdcs5jd7.eu-west-1.aws.materialize.cloud:6875
    environmentdPgwireAddress: string,
    /// Represents the environmentd PG wire protocol address.
    ///
    /// E.g.: 3es24sg5rghjku7josdcs5jd7.eu-west-1.aws.materialize.cloud:443
    environmentdHttpsAddress: string,
    /// Indicates true if the address is resolvable by DNS.
    resolvable: boolean
}

interface Region {
    /// Represents the cluster name:
    ///
    /// E.g.: `mzcloud-production-eu-west-1-0`
    cluster: string,
    /// Represents the complete environment controller url.
    ///
    /// E.g.: `https://ec.0.eu-west-1.aws.cloud.materialize.com:443`
    environmentControllerUrl: string,
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
    /// E..g: `https://rc.eu-west-1.aws.cloud.materialize.com`
    apiUrl: string,
    /// Contains the cloud provider name.
    ///
    /// E.g.: `aws` or `gcp`
    cloudProvider: String,
}

interface CloudProviderResponse {
    data: Array<CloudProvider>,
    nextCursor?: string,
}

export default class CloudClient {
    adminClient: AdminClient;

    constructor(adminClient: AdminClient) {
        this.adminClient = adminClient;
    }

    async fetch(endpoint: string) {
        return fetch(endpoint, {
            method: 'get',
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "Authorization": `Bearer ${(await this.adminClient.getToken())}`
            }
        });
    }

    async listCloudProviders() {
        const cloudProviders = [];
        let cursor = '';

        while (true) {
            let response = await this.fetch(`${PROVIDERS_ENDPOINT}?limit=50&cursor=${cursor}`);

            console.log("[CloudClient]", `Status: ${response.status}`);
            const cloudProviderResponse = (await response.json()) as CloudProviderResponse;
            cloudProviders.push(...cloudProviderResponse.data);

            if (cloudProviderResponse.nextCursor) {
                cursor = cloudProviderResponse.nextCursor;
            } else {
                break;
            }
        }

        return cloudProviders;
    }

    async getRegion(cloudProvider: CloudProvider): Promise<Region> {
        const REGION_ENDPOINT = `${cloudProvider.apiUrl}/api/environmentassignment`;

        let response = await this.fetch(REGION_ENDPOINT);

        console.log("[CloudClient]", `Status: ${response.status}`);
        const [region]: Array<Region> = (await response.json()) as Array<Region>;
        return region;
    }

    async getEnvironment(region: Region): Promise<Environment> {
        const ENVIRONMENT_ENDPOINT = `${region.environmentControllerUrl}/api/environment`;

        let response = await this.fetch(ENVIRONMENT_ENDPOINT);

        console.log("[CloudClient]", `Status: ${response.status}`);
        const [environment]: Array<Environment> = (await response.json()) as Array<Environment>;
        return environment;
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
            const region = await this.getRegion(provider);
            console.log("[CloudClient]", "Region: ", region);

            console.log("[CloudClient]", "Retrieving environment.");
            const environment = await this.getEnvironment(region);
            console.log("[CloudClient]", "Environment: ", environment);
            return environment.environmentdPgwireAddress;
        }
    }
}