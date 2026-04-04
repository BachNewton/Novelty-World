export interface Category {
  name: string;
  slug: string;
  parentSlug?: string;
  description?: string;
}

export interface Project {
  name: string;
  slug: string;
  description: string;
  categorySlug: string;
  icon: string;
}
