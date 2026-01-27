export interface Book {
  id: string
  title: string
  description: string
  author_name: string
  author_id: string
  publisher_name?: string
  language: string
  cover_image_url?: string
  categories: {
    name: string
  }
  price: number
  rating: number
}