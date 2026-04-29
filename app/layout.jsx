import "./globals.css";

export const metadata = {
  title: "Maldives Tax Filer",
  description: "GST, Income Tax, EWT and MIRA input claim assistant",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
