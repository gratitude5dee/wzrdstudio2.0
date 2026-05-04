import { AuraAssetStore } from '@/components/home/AuraAssetStore';

const AssetsPage = () => {
  return (
    <main className="min-h-screen bg-background p-4 md:p-6" data-testid="asset-management-page">
      <AuraAssetStore />
    </main>
  );
};

export default AssetsPage;
