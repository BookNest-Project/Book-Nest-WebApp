import { supabaseAdmin } from '../config/supabase.js';

export const listUsers = async (req, res) => {
  try {
    const { role, q } = req.query;

    let query = supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        role,
        account_status,
        is_banned,
        created_at,
        reader_profiles (
          display_name,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false });

    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const filtered = q
      ? data.filter((item) =>
          item.email?.toLowerCase().includes(q.toLowerCase()) ||
          item.reader_profiles?.display_name?.toLowerCase().includes(q.toLowerCase())
        )
      : data;

    res.json({ users: filtered });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const createAuthorProfile = async (req, res) => {
  try {
    const payload = {
      user_id: req.body.user_id || null,
      pen_name: req.body.pen_name,
      full_name: req.body.full_name || null,
      bio: req.body.bio || null,
      avatar_url: req.body.avatar_url || null,
      website_url: req.body.website_url || null,
      support_email: req.body.support_email || null,
      approval_status: req.body.approval_status,
      created_by_admin_id: req.user.id,
      approved_by_admin_id: req.body.approval_status === 'approved' ? req.user.id : null,
      approved_at: req.body.approval_status === 'approved' ? new Date().toISOString() : null
    };

    const { data, error } = await supabaseAdmin
      .from('author_profiles')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({
      message: 'Author profile created successfully',
      author_profile: data
    });
  } catch (error) {
    console.error('Create author profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createPublisherProfile = async (req, res) => {
  try {
    const payload = {
      user_id: req.body.user_id || null,
      company_name: req.body.company_name,
      legal_name: req.body.legal_name || null,
      tax_id: req.body.tax_id || null,
      bio: req.body.bio || null,
      logo_url: req.body.logo_url || null,
      website_url: req.body.website_url || null,
      support_email: req.body.support_email || null,
      approval_status: req.body.approval_status,
      created_by_admin_id: req.user.id,
      approved_by_admin_id: req.body.approval_status === 'approved' ? req.user.id : null,
      approved_at: req.body.approval_status === 'approved' ? new Date().toISOString() : null
    };

    const { data, error } = await supabaseAdmin
      .from('publisher_profiles')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({
      message: 'Publisher profile created successfully',
      publisher_profile: data
    });
  } catch (error) {
    console.error('Create publisher profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const linkAuthorProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    const { data, error } = await supabaseAdmin
      .from('author_profiles')
      .update({
        user_id,
        approved_by_admin_id: req.user.id,
        approved_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      message: 'Author profile linked successfully',
      author_profile: data
    });
  } catch (error) {
    console.error('Link author profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const linkPublisherProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    const { data, error } = await supabaseAdmin
      .from('publisher_profiles')
      .update({
        user_id,
        approved_by_admin_id: req.user.id,
        approved_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      message: 'Publisher profile linked successfully',
      publisher_profile: data
    });
  } catch (error) {
    console.error('Link publisher profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const reviewBook = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, review_note } = req.body;

    const updates = {
      status,
      review_note: review_note || null,
      reviewed_by_admin_id: req.user.id,
      reviewed_at: new Date().toISOString(),
      submitted_at: status === 'pending_review' ? new Date().toISOString() : undefined
    };

    if (updates.submitted_at === undefined) {
      delete updates.submitted_at;
    }

    const { data, error } = await supabaseAdmin
      .from('books')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      message: 'Book review status updated successfully',
      book: data
    });
  } catch (error) {
    console.error('Review book error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert({
        slug: req.body.slug,
        name: req.body.name,
        description: req.body.description || null
      })
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({
      message: 'Category created successfully',
      category: data
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
