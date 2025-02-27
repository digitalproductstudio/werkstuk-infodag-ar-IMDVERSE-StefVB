export const hasGetUserMedia = async () => {
    // check if getUserMedia is available
    try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        return true;
    } catch (e) {
        return false;
    }
}