// app/layout.tsx
export const metadata = {
  title: "Chandra Prabha",
  description: "Vedic Astrology Report",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
