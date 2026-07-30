export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      deliveries: {
        Row: {
          courier_id: string | null;
          courier_name: string | null;
          created_at: string;
          delivered_at: string | null;
          dispatched_at: string | null;
          id: string;
          notes: string | null;
          order_id: string;
          status: string;
        };
        Insert: {
          courier_id?: string | null;
          courier_name?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          dispatched_at?: string | null;
          id?: string;
          notes?: string | null;
          order_id: string;
          status?: string;
        };
        Update: {
          courier_id?: string | null;
          courier_name?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          dispatched_at?: string | null;
          id?: string;
          notes?: string | null;
          order_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount_cents: number;
          category: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          expense_date: string;
          id: string;
        };
        Insert: {
          amount_cents: number;
          category: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expense_date?: string;
          id?: string;
        };
        Update: {
          amount_cents?: number;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expense_date?: string;
          id?: string;
        };
        Relationships: [];
      };
      menu_item_ingredients: {
        Row: {
          id: string;
          menu_item_id: string;
          quantity: number;
          stock_item_id: string;
        };
        Insert: {
          id?: string;
          menu_item_id: string;
          quantity?: number;
          stock_item_id: string;
        };
        Update: {
          id?: string;
          menu_item_id?: string;
          quantity?: number;
          stock_item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_item_ingredients_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_item_ingredients_stock_item_id_fkey";
            columns: ["stock_item_id"];
            isOneToOne: false;
            referencedRelation: "stock_items";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_items: {
        Row: {
          available: boolean;
          category_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          name: string;
          price_cents: number;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          available?: boolean;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          name: string;
          price_cents: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          available?: boolean;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          name?: string;
          price_cents?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          menu_item_id: string | null;
          name_snapshot: string;
          order_id: string;
          quantity: number;
          unit_price_cents: number;
        };
        Insert: {
          id?: string;
          menu_item_id?: string | null;
          name_snapshot: string;
          order_id: string;
          quantity?: number;
          unit_price_cents: number;
        };
        Update: {
          id?: string;
          menu_item_id?: string | null;
          name_snapshot?: string;
          order_id?: string;
          quantity?: number;
          unit_price_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          address: string | null;
          cancellation_reason: string | null;
          created_at: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee_cents: number;
          estimated_delivery_at: string | null;
          id: string;
          notes: string | null;
          order_number: string;
          order_type: Database["public"]["Enums"]["order_type"];
          status: Database["public"]["Enums"]["order_status"];
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          cancellation_reason?: string | null;
          created_at?: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee_cents?: number;
          estimated_delivery_at?: string | null;
          id?: string;
          notes?: string | null;
          order_number?: string;
          order_type?: Database["public"]["Enums"]["order_type"];
          status?: Database["public"]["Enums"]["order_status"];
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          cancellation_reason?: string | null;
          created_at?: string;
          customer_name?: string;
          customer_phone?: string;
          delivery_fee_cents?: number;
          estimated_delivery_at?: string | null;
          id?: string;
          notes?: string | null;
          order_number?: string;
          order_type?: Database["public"]["Enums"]["order_type"];
          status?: Database["public"]["Enums"]["order_status"];
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      sms_logs: {
        Row: {
          body: string;
          created_at: string;
          error: string | null;
          id: string;
          order_id: string | null;
          provider_message_id: string | null;
          status: string;
          to_phone: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          order_id?: string | null;
          provider_message_id?: string | null;
          status?: string;
          to_phone: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          order_id?: string | null;
          provider_message_id?: string | null;
          status?: string;
          to_phone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sms_logs_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_items: {
        Row: {
          created_at: string;
          id: string;
          min_quantity: number;
          name: string;
          quantity: number;
          unit: string;
          unit_cost_cents: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          min_quantity?: number;
          name: string;
          quantity?: number;
          unit?: string;
          unit_cost_cents?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          min_quantity?: number;
          name?: string;
          quantity?: number;
          unit?: string;
          unit_cost_cents?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assign_delivery: {
        Args: {
          p_courier_id: string;
          p_order_id: string;
        };
        Returns: string;
      };
      create_public_order: {
        Args: {
          p_address: string | null;
          p_customer_name: string;
          p_customer_phone: string;
          p_items: Json;
          p_notes: string | null;
          p_order_type: Database["public"]["Enums"]["order_type"];
        };
        Returns: {
          id: string;
          order_number: string;
          status: Database["public"]["Enums"]["order_status"];
          total_cents: number;
        }[];
      };
      get_public_order: {
        Args: { p_order_id: string };
        Returns: Json;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_assigned_courier: {
        Args: {
          _order_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_courier: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      is_staff: { Args: { _user_id: string }; Returns: boolean };
      list_couriers: {
        Args: Record<PropertyKey, never>;
        Returns: {
          display_name: string;
          user_id: string;
        }[];
      };
      set_order_delivery_terms: {
        Args: {
          p_delivery_fee_cents: number;
          p_estimated_delivery_at: string;
          p_order_id: string;
        };
        Returns: string;
      };
      update_delivery_status: {
        Args: {
          p_delivery_id: string;
          p_status: string;
        };
        Returns: string;
      };
    };
    Enums: {
      app_role: "admin" | "staff" | "estafeta";
      order_status:
        "pendente" | "aceite" | "em_preparacao" | "saiu_entrega" | "entregue" | "cancelado";
      order_type: "entrega" | "takeaway";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff", "estafeta"],
      order_status: [
        "pendente",
        "aceite",
        "em_preparacao",
        "saiu_entrega",
        "entregue",
        "cancelado",
      ],
      order_type: ["entrega", "takeaway"],
    },
  },
} as const;
