export function sortOrder(arr: any[]) {
    return arr.sort((a, b) => {
        return a.order - b.order;
    });
}
