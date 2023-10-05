export enum Errors {
    /**
     * Raises when trying to verify an invalid JWT token using JWKS.
     */
    verifyCredential = "Failed to verify credentials.",
    /**
     * Raises when the user claims are invalid.
     */
    retrievingEmail = "Failed to retrieve email.",
    /**
     * Raises when the email is not present in the claims.
     */
    emailNotPresentInClaims = "Email is not present in claims.",
    /**
     * Raises when an issue happens listing the cloud providers.
     */
    listingCloudProviders = "Failed to retrieve the cloud providers.",
    /**
     * Raises when it is not possible to parse the response
     * from the API or an error during the request.
     */
    retrievingRegion = "Failed to retrieve region.",
    /**
     * Raises when a user tries to access a disabled region.
     */
    disabledRegion = "Selected region is disabled.",
    /**
     * Raises when a user tries to access an invalid provider.
     * e.g.: aws/us-central-77
     *
     * When using this error, the ${region} must be replaced
     * with the invalid provider name.
     */
    invalidProvider = "Selected region '${region}' is invalid.",
    /**
     * Raises when the app-password in the configuration file,
     * or provided by the console has an unexpected amount of characters.
     */
    invalidLengthAppPassword = "Invalid amount of characters in the app-password.",
    /**
     * Raises when the app-password UUIDs (userId or secret) is not valid.
     */
    invalidUuid = "Parsing the app password fields as UUIDs fails.",
    /**
     * Raises when the app-password is invalid. Can happen if the app-password
     * UUIDs (userId or secret) are incorrect.
     */
    invalidAppPassword = "App-password format is invalid.",
    /**
     * Raises when loading an environment without setting up the cloud or admin client.
     */
    unconfiguredClients = "The clients are not yet setup.",
    /**
     * Raises when loading an environment without setting up a profile.
     */
    unconfiguredProfile = "A profile is not yet set up.",
    /**
     * Raises when the user switches to a database that does not exists
     * anymore.
     */
    databaseIsNotAvailable = "The selected database is not available anymore.",
    /**
     * Raises when the user switches to a cluster that does not exists
     * anymore.
     */
    clusterIsNotAvailable = "The selected cluster is not available anymore.",
    /**
     * Raises when the user switches to a schema that does not exists
     * anymore.
     */
    schemaIsNotAvailable = "The selected schema is not available anymore."
}
