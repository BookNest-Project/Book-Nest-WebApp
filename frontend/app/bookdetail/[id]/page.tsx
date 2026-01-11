"use client";

import { useParams, useRouter } from "next/navigation";
import BookDetailView from "../page";

export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  
  // params.id comes from the folder name [id]
  const bookId = params.id as string;

  return (
    <BookDetailView 
      bookId={bookId} 
      onBack={() => router.back()} 
    />
  );
}