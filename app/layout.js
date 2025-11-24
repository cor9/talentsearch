import './globals.css';

export const metadata = {
  title: 'Talent Search | Child Actor 101',
  description: 'View and explore talent submissions for Child Actor 101.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


